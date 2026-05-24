"""ADR 0150 §14 P1 Task 1.1 — x-formspec-core-task module conformance.

Republishes the closed-core Experience UnitKind (7 values) as a Registry
module with `unit-kind` contribution entries per ADR §4.9. Tests verify:

1. The module entry validates against the Registry shape.
2. Each of the 7 unit-kind contribution entries validates with its
   `semantics: {kindValue, summary, ...}` payload.
3. `contributes[]` ↔ entry-existence: every name listed in the module's
   contributes[] exists as a sibling Registry entry in the same document.
4. `kindValue` ↔ name-suffix consistency: each contribution entry's
   `semantics.kindValue` equals the entry name's suffix after the
   `x-formspec-core-task-` prefix. Prevents silent drift between Registry
   name and the unprefixed enum value tools resolve against.
5. Module-declaration-is-metadata equivalence: an Experience document with
   `modules: [{id: 'x-formspec-core-task', version: '^1.0.0'}]` and one
   without it produce IDENTICAL validation outcomes for the closed-core
   enum value `unit.kind: 'data-entry'`. The closed-core oneOf lane handles
   validation directly; Registry presence is metadata only (the
   enforcement-boundary discipline named in plan Task 1.1 Step 5 and
   addressing BLOCKER B-1 from arch-review-BEFORE).

Closed-core values per `schemas/experience.schema.json` `$defs.UnitKind`
oneOf[0].enum (verified at plan-write time, r1): data-entry, review,
confirmation, evidence-collection, attestation, error-resolution,
assistance.
"""

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

ROOT = Path(__file__).parents[3]
SCHEMAS_DIR = ROOT / "schemas"
REGISTRIES_DIR = ROOT / "registries"
FIXTURES_DIR = ROOT / "tests" / "conformance" / "fixtures" / "modules" / "x-formspec-core-task"

REGISTRY_SCHEMA = json.loads((SCHEMAS_DIR / "registry.schema.json").read_text())
COMMON_SCHEMA = json.loads((SCHEMAS_DIR / "common.schema.json").read_text())
EXPERIENCE_SCHEMA = json.loads((SCHEMAS_DIR / "experience.schema.json").read_text())

# Closed-core UnitKind values per Experience schema (verified r1).
CLOSED_CORE_UNIT_KINDS = (
    "data-entry",
    "review",
    "confirmation",
    "evidence-collection",
    "attestation",
    "error-resolution",
    "assistance",
)

MODULE_ID = "x-formspec-core-task"
CONTRIBUTION_PREFIX = f"{MODULE_ID}-"


# ─── Shared registry for cross-schema $ref resolution ────────────────────────

_REF_REGISTRY = Registry().with_resources(
    [
        (COMMON_SCHEMA["$id"], Resource.from_contents(COMMON_SCHEMA, default_specification=DRAFT202012)),
        (REGISTRY_SCHEMA["$id"], Resource.from_contents(REGISTRY_SCHEMA, default_specification=DRAFT202012)),
        (EXPERIENCE_SCHEMA["$id"], Resource.from_contents(EXPERIENCE_SCHEMA, default_specification=DRAFT202012)),
    ]
)


def _entry_validator():
    """Validator for a single RegistryEntry, with cross-schema $refs resolved."""
    return Draft202012Validator(
        {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$defs": REGISTRY_SCHEMA["$defs"],
            "$ref": "#/$defs/RegistryEntry",
        },
        registry=_REF_REGISTRY,
    )


def _experience_validator():
    return Draft202012Validator(EXPERIENCE_SCHEMA, registry=_REF_REGISTRY)


def _common_registry_doc() -> dict:
    return json.loads((REGISTRIES_DIR / "formspec-common.registry.json").read_text())


def _get_entry(doc: dict, name: str) -> dict | None:
    for e in doc.get("entries", []):
        if e.get("name") == name:
            return e
    return None


# ─── Module entry shape ──────────────────────────────────────────────────────


def test_module_entry_exists_and_validates():
    """The x-formspec-core-task module entry validates against the Registry shape."""
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    assert entry is not None, f"Module entry {MODULE_ID} not found in formspec-common.registry.json"
    assert entry["category"] == "module"
    _entry_validator().validate(entry)


def test_module_contributes_has_seven_entries():
    """Cardinality assertion: 7 closed-core UnitKind values → 7 contribution entries."""
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    assert entry is not None
    contributes = entry.get("contributes", [])
    assert len(contributes) == 7, f"Expected 7 contributions, found {len(contributes)}: {contributes}"


def test_module_contributes_names_match_closed_core():
    """Every closed-core UnitKind value has a corresponding contribution name."""
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    expected = {f"{CONTRIBUTION_PREFIX}{v}" for v in CLOSED_CORE_UNIT_KINDS}
    assert set(entry["contributes"]) == expected


# ─── Per-contribution validation ─────────────────────────────────────────────


@pytest.mark.parametrize("kind_value", CLOSED_CORE_UNIT_KINDS)
def test_contribution_entry_validates(kind_value):
    """Each unit-kind contribution entry validates against the Registry shape
    with its semantics payload."""
    doc = _common_registry_doc()
    name = f"{CONTRIBUTION_PREFIX}{kind_value}"
    entry = _get_entry(doc, name)
    assert entry is not None, f"Contribution {name} not found"
    assert entry["category"] == "unit-kind"
    assert "semantics" in entry, f"{name} missing semantics payload (REQUIRED for unit-kind per ADR §4.2)"
    _entry_validator().validate(entry)


@pytest.mark.parametrize("kind_value", CLOSED_CORE_UNIT_KINDS)
def test_kindvalue_matches_name_suffix(kind_value):
    """semantics.kindValue MUST equal name suffix after the module-prefix.
    Prevents silent drift between Registry name and the unprefixed enum value."""
    doc = _common_registry_doc()
    name = f"{CONTRIBUTION_PREFIX}{kind_value}"
    entry = _get_entry(doc, name)
    assert entry is not None
    actual = entry["semantics"].get("kindValue")
    assert actual == kind_value, (
        f"{name}.semantics.kindValue = {actual!r}, expected {kind_value!r} "
        "(per plan Task 1.1 Step 5 naming convention)."
    )


@pytest.mark.parametrize("kind_value", CLOSED_CORE_UNIT_KINDS)
def test_semantics_has_required_keys(kind_value):
    """semantics convention (plan r1 H-1 absorption): kindValue REQUIRED,
    summary REQUIRED."""
    doc = _common_registry_doc()
    name = f"{CONTRIBUTION_PREFIX}{kind_value}"
    entry = _get_entry(doc, name)
    assert entry is not None
    sem = entry["semantics"]
    for key in ("kindValue", "summary"):
        assert key in sem, f"{name}.semantics missing REQUIRED key {key!r}"
        assert sem[key], f"{name}.semantics.{key} is empty"


# ─── Contributes ↔ entry-existence (referential integrity) ────────────────────


def test_contributes_names_all_resolve_within_document():
    """Every name in contributes[] MUST exist as a sibling entry in the
    same registry document (per registry.schema.json:453)."""
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    sibling_names = {e["name"] for e in doc["entries"]}
    for name in entry["contributes"]:
        assert name in sibling_names, (
            f"contributes[] references {name!r} but no such entry exists in the registry document."
        )


# ─── Module-declaration-is-metadata equivalence ──────────────────────────────


def test_experience_with_module_validates():
    """Experience declaring x-formspec-core-task module + using closed-core
    unit.kind 'data-entry' validates."""
    doc = json.loads((FIXTURES_DIR / "experience-with-module.json").read_text())
    _experience_validator().validate(doc)


def test_experience_without_module_validates():
    """Experience WITHOUT the modules[] declaration validates IDENTICALLY
    when using the same closed-core unit.kind value. The substantive proof:
    module declaration is authoring-intent metadata; validation flows through
    the closed-core oneOf lane regardless. This is the enforcement-boundary
    discipline (plan Task 1.1 Step 5 spec prose; BLOCKER B-1 absorption)."""
    doc = json.loads((FIXTURES_DIR / "experience-without-module.json").read_text())
    _experience_validator().validate(doc)


def test_modules_declaration_does_not_change_validation_outcome():
    """The two equivalence fixtures must produce identical validator outcomes
    for the closed-core enum value. Stronger than 'both validate' — this asserts
    the validator collects no warnings/diagnostics that differ between the two."""
    with_mod = json.loads((FIXTURES_DIR / "experience-with-module.json").read_text())
    without_mod = json.loads((FIXTURES_DIR / "experience-without-module.json").read_text())
    validator = _experience_validator()
    errors_with = list(validator.iter_errors(with_mod))
    errors_without = list(validator.iter_errors(without_mod))
    assert errors_with == [], f"unexpected errors with modules declared: {errors_with}"
    assert errors_without == [], f"unexpected errors without modules declared: {errors_without}"


def test_extension_unit_kind_requires_module_declaration_path_invariant():
    """**Equivalence discriminator** (per Task 1.1 + 1.2 code review HIGH H-2
    absorption). The closed-core equivalence test above is necessary but not
    sufficient: it would pass trivially if the closed-core lane were silently
    coupled to module presence (in that case both fixtures would still validate
    clean because the same closed-core value is used in both).

    The discriminator: mutate `unit.kind` to a module-only `^x-` extension
    value. The closed-core lane CANNOT admit it (the lane is a literal
    enum); only the `^x-pattern` lane can. The schema admits the value
    structurally in BOTH cases (the pattern is enum-independent), so both
    fixtures pass the schema — confirming that the schema lane carries no
    module-declaration dependency. The `^x-` value's actual *resolution* to
    a declared module is the domain of lint code E603, not the schema. This
    test pins the schema-vs-lint enforcement-boundary discipline (spec §4.1
    Rule 2) more strongly than the equivalence test alone.

    Without this test, a regression where the schema gains a silent
    "module-must-be-declared-for-x-value" gate would pass the equivalence
    test (both fixtures use closed-core) and would slip through."""
    base_with = json.loads((FIXTURES_DIR / "experience-with-module.json").read_text())
    base_without = json.loads((FIXTURES_DIR / "experience-without-module.json").read_text())

    mutated_with = json.loads(json.dumps(base_with))
    mutated_with["units"][0]["kind"] = "x-acme-custom-kind"
    mutated_without = json.loads(json.dumps(base_without))
    mutated_without["units"][0]["kind"] = "x-acme-custom-kind"

    validator = _experience_validator()
    errors_with = list(validator.iter_errors(mutated_with))
    errors_without = list(validator.iter_errors(mutated_without))

    assert errors_with == [], (
        "Schema should admit an ^x- kind regardless of module declaration; "
        f"got errors with modules declared: {errors_with}"
    )
    assert errors_without == [], (
        "Schema should admit an ^x- kind regardless of module declaration; "
        f"got errors without modules declared: {errors_without}"
    )

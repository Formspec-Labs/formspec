"""ADR 0150 §14 P1 Task 1.2 — x-formspec-core-actions module conformance.

Republishes Response Actions intent closed-core (5 values) + the closed-core
MasterTable rows (5 rows) as a Registry module per ADR §4.9 + §4.2.

Two contribution categories ship together:
- 5 `action-intent` entries (one per intent) carrying the ValidationTuple
  per VM §6.1 in the `validation` payload.
- 5 `validation-mapping-row` entries (one per canonical row) carrying the
  row per VM §6 in the `row` payload.

The 5 canonical rows have a JCS byte-equality invariant per P0 Task 9: each
contribution's `row` payload, when JCS-canonicalized, MUST appear as an
element of the canonical 5-row fixture set at
tests/conformance/fixtures/validation-mapping/closed-core-5-rows-jcs.json.

Plan: thoughts/plans/2026-05-23-adr-0150-p1-p4-implementation.md Task 1.2.
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
JCS_FIXTURE = ROOT / "tests" / "conformance" / "fixtures" / "validation-mapping" / "closed-core-5-rows-jcs.json"

REGISTRY_SCHEMA = json.loads((SCHEMAS_DIR / "registry.schema.json").read_text())
COMMON_SCHEMA = json.loads((SCHEMAS_DIR / "common.schema.json").read_text())

CLOSED_CORE_INTENTS = (
    "save-draft",
    "autosave",
    "review",
    "submit",
    "request-evidence",
)

MODULE_ID = "x-formspec-core-actions"
INTENT_PREFIX = f"{MODULE_ID}-intent-"
ROW_PREFIX = f"{MODULE_ID}-row-"


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


def _jcs_canonicalize(obj) -> str:
    """JCS-canonicalize a JSON object per RFC 8785: keys alphabetically
    sorted at every level; no whitespace; no escaped slashes; UTF-8 output."""
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


# ─── Module entry shape ──────────────────────────────────────────────────────


def test_module_entry_exists_and_validates():
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    assert entry is not None, f"Module entry {MODULE_ID} not found"
    assert entry["category"] == "module"
    _entry_validator().validate(entry)


def test_module_contributes_has_ten_entries():
    """5 action-intent + 5 validation-mapping-row = 10 contributions."""
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    assert entry is not None
    assert len(entry["contributes"]) == 10, (
        f"Expected 10 contributions, found {len(entry['contributes'])}: {entry['contributes']}"
    )


def test_module_contributes_split_evenly_across_categories():
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    expected_intent_names = {f"{INTENT_PREFIX}{i}" for i in CLOSED_CORE_INTENTS}
    expected_row_names = {f"{ROW_PREFIX}{i}" for i in CLOSED_CORE_INTENTS}
    assert set(entry["contributes"]) == expected_intent_names | expected_row_names


# ─── Per-contribution validation ─────────────────────────────────────────────


@pytest.mark.parametrize("intent", CLOSED_CORE_INTENTS)
def test_action_intent_contribution_validates(intent):
    doc = _common_registry_doc()
    name = f"{INTENT_PREFIX}{intent}"
    entry = _get_entry(doc, name)
    assert entry is not None, f"Contribution {name} not found"
    assert entry["category"] == "action-intent"
    assert "validation" in entry, f"{name} missing validation payload (REQUIRED for action-intent per ADR §4.2)"
    _entry_validator().validate(entry)


@pytest.mark.parametrize("intent", CLOSED_CORE_INTENTS)
def test_validation_mapping_row_contribution_validates(intent):
    doc = _common_registry_doc()
    name = f"{ROW_PREFIX}{intent}"
    entry = _get_entry(doc, name)
    assert entry is not None, f"Contribution {name} not found"
    assert entry["category"] == "validation-mapping-row"
    assert "row" in entry, f"{name} missing row payload (REQUIRED for validation-mapping-row per ADR §4.2)"
    _entry_validator().validate(entry)


# ─── kindValue ↔ name-suffix consistency (per Task 1.1 convention) ───────────


@pytest.mark.parametrize("intent", CLOSED_CORE_INTENTS)
def test_action_intent_payload_intent_matches_name_suffix(intent):
    """The action-intent's `validation.intent` field must equal the name
    suffix after the `x-formspec-core-actions-intent-` prefix.

    This is the action-intent flavor of the kindValue ↔ name-suffix
    consistency rule from Task 1.1 (specs/registry/extension-registry.md
    §4.1 rule 3). The ValidationTuple's `intent` field is the natural
    `kindValue` analogue."""
    doc = _common_registry_doc()
    entry = _get_entry(doc, f"{INTENT_PREFIX}{intent}")
    assert entry["validation"]["intent"] == intent


@pytest.mark.parametrize("intent", CLOSED_CORE_INTENTS)
def test_validation_mapping_row_intent_matches_name_suffix(intent):
    doc = _common_registry_doc()
    entry = _get_entry(doc, f"{ROW_PREFIX}{intent}")
    assert entry["row"]["intent"] == intent


# ─── JCS byte-equality invariant (per P0 Task 9 + plan Task 1.2 Step 1) ──────


def _canonical_set() -> set[str]:
    rows = json.loads(JCS_FIXTURE.read_text())
    return {_jcs_canonicalize(r) for r in rows}


def test_canonical_jcs_fixture_has_five_rows():
    rows = json.loads(JCS_FIXTURE.read_text())
    assert len(rows) == 5, f"P0 Task 9 canonical fixture expected 5 rows, has {len(rows)}"


@pytest.mark.parametrize("intent", CLOSED_CORE_INTENTS)
def test_validation_mapping_row_payload_matches_canonical_jcs(intent):
    """Per ADR §4.2 + plan Task 1.2 Step 1: each validation-mapping-row
    contribution's `row` payload, when JCS-canonicalized, must appear in
    the canonical 5-row fixture set."""
    doc = _common_registry_doc()
    entry = _get_entry(doc, f"{ROW_PREFIX}{intent}")
    canonical = _canonical_set()
    actual = _jcs_canonicalize(entry["row"])
    assert actual in canonical, (
        f"{ROW_PREFIX}{intent}.row JCS-canonical bytes are not in the canonical 5-row set.\n"
        f"  actual:    {actual}\n"
        f"  canonical: {sorted(canonical)}"
    )


@pytest.mark.parametrize("intent", CLOSED_CORE_INTENTS)
def test_action_intent_validation_matches_canonical_jcs(intent):
    """Same JCS invariant applies to action-intent contributions: each
    contribution's `validation` ValidationTuple, JCS-canonicalized, must
    appear in the canonical 5-row fixture set. The MasterTable rows
    ARE the ValidationTuples — same data shape."""
    doc = _common_registry_doc()
    entry = _get_entry(doc, f"{INTENT_PREFIX}{intent}")
    canonical = _canonical_set()
    actual = _jcs_canonicalize(entry["validation"])
    assert actual in canonical, (
        f"{INTENT_PREFIX}{intent}.validation JCS-canonical bytes are not in the canonical 5-row set.\n"
        f"  actual:    {actual}\n"
        f"  canonical: {sorted(canonical)}"
    )


# ─── contributes[] ↔ entry existence ─────────────────────────────────────────


def test_contributes_names_all_resolve_within_document():
    doc = _common_registry_doc()
    entry = _get_entry(doc, MODULE_ID)
    sibling_names = {e["name"] for e in doc["entries"]}
    for name in entry["contributes"]:
        assert name in sibling_names, f"contributes[] references {name!r} but no such entry exists."


# ─── Negative-case template (per Task 1.1 AFTER MEDIUM-2 finding) ────────────
#
# The semantics payload's `processorObligation` / `rendererObligation` keys
# are OPTIONAL per specs/registry/extension-registry.md §4.1 Rule 3. The
# Task 1.1 test file only asserted the REQUIRED keys are present; this test
# template adds the missing piece: a minimal payload (REQUIRED keys only)
# must still validate. The same posture applies to action-intent's
# `validation` payload structure — the ValidationTuple has 4 keys and all
# are required by VM §6.1, so the negative case here is "an entry with
# only the schema-required Registry fields" not "an entry with a stripped
# validation tuple."


def test_action_intent_entry_with_only_schema_required_fields_validates():
    """A minimal action-intent entry carrying only `validation` (the
    category-required payload per registry.schema.json's allOf gate) +
    the universal RegistryEntry required fields validates. Confirms the
    schema does not silently demand any non-spec key beyond the documented
    contract."""
    minimal = {
        "name": "x-formspec-core-actions-intent-test-minimal",
        "category": "action-intent",
        "version": "1.0.0",
        "status": "stable",
        "description": "Minimal test entry.",
        "compatibility": {"formspecVersion": ">=1.0.0 <2.0.0"},
        "validation": {
            "intent": "submit",
            "profile": "on-submit",
            "blocking": "block-on-error",
            "persistence": "complete-response",
        },
    }
    _entry_validator().validate(minimal)

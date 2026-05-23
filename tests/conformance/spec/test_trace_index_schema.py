"""Schema-shape conformance for `schemas/trace-index.schema.json` (Task 11).

Pins the closed v1 vocabulary:
  - 11 edge kinds (`component-renders-item`, `unit-collects-item`,
    `trigger-invokes-action`, `item-depends-on-item`, `unit-serves-task`,
    `task-involves-actor`, `action-emits-effect`, `action-has-precondition`,
    `concept-refs-item`, `concept-refs-component-node`,
    `node-visibility-references-item`).
  - 5 source kinds (`definition`, `experience`, `responseActions`,
    `component`, `ontology`).
  - Per-kind identity tuple shape (§3.3 — Definition gets exactly
    `{url, version}`; sidecars get `{sourceRef, targetDefinitionUrl,
    version[, url]}`).
  - Per-kind endpoint prefix ordering (§5.6).
  - $formspecTrace pinned to "1.0".
  - SHA-256 digest pattern (§4.1).

Run order: this pytest is authored against the schema described in
plan Task 11 (`thoughts/plans/2026-05-22-trace-spec.md` lines ~907-1220).
The schema is a required contract artifact; absence is a test failure.

Negative tests cover the §5.1 / §3.3 / §10.2 prohibitions:
  - extra top-level members rejected
  - extra source-entry members rejected
  - extra edge-entry members rejected
  - unknown edge kinds rejected
  - mis-ordered endpoint prefixes rejected
  - non-SHA-256 digest rejected
  - sidecar identity rejecting fake `id` field
  - definition identity rejecting `sourceRef`
  - $formspecTrace locked to "1.0"
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator

REPO = Path(__file__).resolve().parents[3]
SCHEMA_PATH = REPO / "schemas" / "trace-index.schema.json"
FIXTURE_ROOT = REPO / "tests" / "conformance" / "fixtures" / "trace"

_VALID_DIGEST = "sha256:" + ("0" * 64)


def _load(p: Path) -> dict:
    return json.loads(p.read_text())


@pytest.fixture(scope="module")
def schema() -> dict:
    doc = _load(SCHEMA_PATH)
    Draft202012Validator.check_schema(doc)
    return doc


@pytest.fixture(scope="module")
def validator(schema: dict) -> Draft202012Validator:
    return Draft202012Validator(schema)


def _trace_fixture_dirs() -> list[Path]:
    if not FIXTURE_ROOT.exists():
        return []
    return sorted(p for p in FIXTURE_ROOT.iterdir() if p.is_dir())


def _minimal_doc(**overrides) -> dict:
    """Smallest TraceIndex doc that passes the schema.

    Test functions clone this and mutate one field to drive a single
    negative assertion.
    """
    doc = {"$formspecTrace": "1.0", "sources": [], "edges": []}
    doc.update(overrides)
    return doc


# ---------------------------------------------------------------------------
# Positive — every fixture validates
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "fixture_dir", _trace_fixture_dirs() or [None], ids=lambda p: p.name if p else "no-fixtures"
)
def test_expected_index_is_schema_valid(
    validator: Draft202012Validator, fixture_dir: Path
) -> None:
    """Every fixture's `expected-index.json` MUST validate against the schema.

    Digest placeholders (`"<computed>"`) are substituted with a syntactically
    valid digest before validation so the digest-pattern check (§4.1) passes.
    """
    if fixture_dir is None:
        pytest.skip("No fixtures present under tests/conformance/fixtures/trace/")
    expected_path = fixture_dir / "expected-index.json"
    if not expected_path.exists():
        pytest.skip(f"{fixture_dir.name}: no expected-index.json")
    expected = _load(expected_path)
    for src in expected.get("sources", []):
        if src.get("digest") == "<computed>":
            src["digest"] = _VALID_DIGEST
    errors = sorted(validator.iter_errors(expected), key=lambda e: e.path)
    assert errors == [], (
        f"{fixture_dir.name}: schema validation errors: "
        f"{[e.message for e in errors]}"
    )


def test_schema_is_draft_2020_12(schema: dict) -> None:
    """The schema MUST declare itself as JSON Schema 2020-12."""
    assert schema.get("$schema") == "https://json-schema.org/draft/2020-12/schema"


# ---------------------------------------------------------------------------
# Closed enums (§5.1, §3.2)
# ---------------------------------------------------------------------------


def test_edge_kind_enum_pins_eleven_v1_kinds(schema: dict) -> None:
    """Edge-kind enum MUST be exactly the closed v1 set of 11 kinds (§5.1).

    Adding or removing a kind is a spec change. This test fails on drift.
    """
    expected = {
        "component-renders-item",
        "unit-collects-item",
        "trigger-invokes-action",
        "item-depends-on-item",
        "unit-serves-task",
        "task-involves-actor",
        "action-emits-effect",
        "action-has-precondition",
        "concept-refs-item",
        "concept-refs-component-node",
        "node-visibility-references-item",
    }
    edge_entry = schema["$defs"]["EdgeEntry"]
    actual = set(edge_entry["properties"]["kind"]["enum"])
    assert actual == expected, (
        f"edge-kind enum drift: missing={expected - actual}, "
        f"extra={actual - expected}"
    )


def test_source_kind_enum_pins_five_v1_kinds(schema: dict) -> None:
    """Source-kind enum MUST be exactly the closed v1 set of 5 kinds (§3.2)."""
    expected = {"definition", "experience", "responseActions", "component", "ontology"}
    source_entry = schema["$defs"]["SourceEntry"]
    actual = set(source_entry["properties"]["kind"]["enum"])
    assert actual == expected, (
        f"source-kind enum drift: missing={expected - actual}, "
        f"extra={actual - expected}"
    )


# ---------------------------------------------------------------------------
# Top-level shape
# ---------------------------------------------------------------------------


def test_minimal_empty_index_validates(validator: Draft202012Validator) -> None:
    """A {$formspecTrace, sources:[], edges:[]} document MUST validate."""
    assert validator.is_valid(_minimal_doc())


def test_extra_top_level_property_rejected(validator: Draft202012Validator) -> None:
    """§2.3: no top-level members outside `$formspecTrace`, `sources`, `edges`."""
    assert not validator.is_valid(_minimal_doc(extra="rejected"))


def test_version_marker_locked_to_1_0(validator: Draft202012Validator) -> None:
    """§2.1: $formspecTrace MUST be the const "1.0" for this schema."""
    assert not validator.is_valid({"$formspecTrace": "0.9", "sources": [], "edges": []})
    assert not validator.is_valid({"$formspecTrace": "2.0", "sources": [], "edges": []})
    assert not validator.is_valid({"$formspecTrace": 1.0, "sources": [], "edges": []})


def test_missing_required_top_level_fields_rejected(
    validator: Draft202012Validator,
) -> None:
    assert not validator.is_valid({"sources": [], "edges": []})
    assert not validator.is_valid({"$formspecTrace": "1.0", "edges": []})
    assert not validator.is_valid({"$formspecTrace": "1.0", "sources": []})


# ---------------------------------------------------------------------------
# Source entry shape (§3.2 / §3.3)
# ---------------------------------------------------------------------------


def test_definition_source_requires_url_and_version(
    validator: Draft202012Validator,
) -> None:
    doc = _minimal_doc(sources=[{
        "kind": "definition",
        "identity": {"url": "https://x.test", "version": "1.0.0"},
        "digest": _VALID_DIGEST,
    }])
    assert validator.is_valid(doc)


def test_definition_identity_rejects_source_ref(
    validator: Draft202012Validator,
) -> None:
    """§3.3: definition identity is exactly `{url, version}` — `sourceRef` forbidden."""
    doc = _minimal_doc(sources=[{
        "kind": "definition",
        "identity": {
            "url": "https://x.test",
            "version": "1.0.0",
            "sourceRef": "definition.json",
        },
        "digest": _VALID_DIGEST,
    }])
    assert not validator.is_valid(doc), (
        "definition identity must reject sourceRef (additionalProperties=false)"
    )


def test_sidecar_identity_rejects_fake_id(validator: Draft202012Validator) -> None:
    """§3.3: sidecar identity is `{sourceRef, targetDefinitionUrl, version}` —
    no top-level `id` field is permitted as a substitute for `sourceRef`."""
    doc = _minimal_doc(sources=[{
        "kind": "responseActions",
        "identity": {"id": "actions", "version": "1.0.0"},
        "digest": _VALID_DIGEST,
    }])
    assert not validator.is_valid(doc), (
        "sidecar source identity must use sourceRef, not fake id"
    )


def test_experience_identity_requires_source_ref(
    validator: Draft202012Validator,
) -> None:
    doc = _minimal_doc(sources=[{
        "kind": "experience",
        "identity": {
            "sourceRef": "experience.json",
            "targetDefinitionUrl": "https://x.test",
            "version": "1.0.0",
        },
        "digest": _VALID_DIGEST,
    }])
    assert validator.is_valid(doc)


def test_component_identity_allows_optional_url(
    validator: Draft202012Validator,
) -> None:
    base = {
        "sourceRef": "component.json",
        "targetDefinitionUrl": "https://x.test",
        "version": "1.0.0",
    }
    assert validator.is_valid(_minimal_doc(sources=[{
        "kind": "component",
        "identity": base,
        "digest": _VALID_DIGEST,
    }]))
    with_url = dict(base, url="https://x.test/components/main")
    assert validator.is_valid(_minimal_doc(sources=[{
        "kind": "component",
        "identity": with_url,
        "digest": _VALID_DIGEST,
    }]))


def test_ontology_identity_shape(validator: Draft202012Validator) -> None:
    doc = _minimal_doc(sources=[{
        "kind": "ontology",
        "identity": {
            "sourceRef": "ontology.json",
            "targetDefinitionUrl": "https://x.test",
            "version": "1.0.0",
        },
        "digest": _VALID_DIGEST,
    }])
    assert validator.is_valid(doc)


def test_extra_source_entry_field_rejected(validator: Draft202012Validator) -> None:
    """§2.3 / §3.2: source entry MUST NOT carry extra fields."""
    doc = _minimal_doc(sources=[{
        "kind": "definition",
        "identity": {"url": "https://x.test", "version": "1.0.0"},
        "digest": _VALID_DIGEST,
        "extra": "rejected",
    }])
    assert not validator.is_valid(doc)


def test_unknown_source_kind_rejected(validator: Draft202012Validator) -> None:
    """§3.2: closed enum — `theme`, `mapping`, etc. are not v1 source kinds."""
    for bad_kind in ("theme", "mapping", "respondent-ledger", "intake-handoff"):
        doc = _minimal_doc(sources=[{
            "kind": bad_kind,
            "identity": {"url": "https://x.test", "version": "1.0.0"},
            "digest": _VALID_DIGEST,
        }])
        assert not validator.is_valid(doc), (
            f"source kind {bad_kind!r} must be rejected (not in v1 closed enum)"
        )


# ---------------------------------------------------------------------------
# Digest pattern (§4.1)
# ---------------------------------------------------------------------------


def test_digest_pattern_enforced_md5_rejected(
    validator: Draft202012Validator,
) -> None:
    doc = _minimal_doc(sources=[{
        "kind": "definition",
        "identity": {"url": "https://x.test", "version": "1.0.0"},
        "digest": "md5:abcdef0123456789abcdef0123456789",
    }])
    assert not validator.is_valid(doc), "non-SHA-256 digest must be rejected"


def test_digest_pattern_enforced_uppercase_hex_rejected(
    validator: Draft202012Validator,
) -> None:
    """§4.1: encoding is `sha256:<lowercase-hex>`; uppercase hex is non-conforming."""
    doc = _minimal_doc(sources=[{
        "kind": "definition",
        "identity": {"url": "https://x.test", "version": "1.0.0"},
        "digest": "sha256:" + "A" * 64,
    }])
    assert not validator.is_valid(doc)


def test_digest_pattern_enforced_short_hex_rejected(
    validator: Draft202012Validator,
) -> None:
    """§4.1: digest MUST be exactly 64 hex chars."""
    doc = _minimal_doc(sources=[{
        "kind": "definition",
        "identity": {"url": "https://x.test", "version": "1.0.0"},
        "digest": "sha256:" + "0" * 32,
    }])
    assert not validator.is_valid(doc)


# ---------------------------------------------------------------------------
# Edge entry shape (§5.4 / §5.6)
# ---------------------------------------------------------------------------


def test_unknown_edge_kind_rejected(validator: Draft202012Validator) -> None:
    doc = _minimal_doc(edges=[
        {"kind": "unknown-kind", "endpoints": ["item:x", "unit:y"]},
    ])
    assert not validator.is_valid(doc)


def test_extra_edge_entry_field_rejected(validator: Draft202012Validator) -> None:
    """§2.3 / §5.4: edge entry MUST NOT carry extra fields — no severity/code/reason.

    This is the structural guarantee behind the §8.2 invariant that Trace
    carries no findings."""
    doc = _minimal_doc(edges=[{
        "kind": "component-renders-item",
        "endpoints": [
            "componentNodePath:/tree/children/0",
            "item:applicantName",
        ],
        "severity": "warning",
    }])
    assert not validator.is_valid(doc)


def test_endpoints_must_have_exactly_two_entries(
    validator: Draft202012Validator,
) -> None:
    for endpoints in (
        [],
        ["componentNodePath:/tree/children/0"],
        [
            "componentNodePath:/tree/children/0",
            "item:applicantName",
            "item:extra",
        ],
    ):
        doc = _minimal_doc(edges=[{
            "kind": "component-renders-item",
            "endpoints": endpoints,
        }])
        assert not validator.is_valid(doc), (
            f"endpoints of length {len(endpoints)} must be rejected"
        )


def test_component_renders_item_endpoint_prefixes_enforced(
    validator: Draft202012Validator,
) -> None:
    """§5.6: endpoints[0] = componentNodePath:, endpoints[1] = item:.
    Mis-ordered endpoints MUST be rejected by the per-kind allOf branch."""
    doc = _minimal_doc(edges=[{
        "kind": "component-renders-item",
        "endpoints": ["item:applicantName", "componentNodePath:/tree"],
    }])
    assert not validator.is_valid(doc)


def test_unit_collects_item_endpoint_prefixes_enforced(
    validator: Draft202012Validator,
) -> None:
    doc = _minimal_doc(edges=[{
        "kind": "unit-collects-item",
        "endpoints": ["item:x", "unit:identity"],  # reversed
    }])
    assert not validator.is_valid(doc)


def test_trigger_invokes_action_endpoint_prefixes_enforced(
    validator: Draft202012Validator,
) -> None:
    doc = _minimal_doc(edges=[{
        "kind": "trigger-invokes-action",
        "endpoints": ["action:submit", "componentNodePath:/tree/children/0"],
    }])
    assert not validator.is_valid(doc)


def test_item_depends_on_item_requires_two_item_endpoints(
    validator: Draft202012Validator,
) -> None:
    """§5.6: both endpoints MUST carry `item:` prefix."""
    doc = _minimal_doc(edges=[{
        "kind": "item-depends-on-item",
        "endpoints": ["item:dependent", "unit:identity"],
    }])
    assert not validator.is_valid(doc)


def test_unit_serves_task_endpoint_prefixes_enforced(
    validator: Draft202012Validator,
) -> None:
    doc = _minimal_doc(edges=[{
        "kind": "unit-serves-task",
        "endpoints": ["task:identify", "unit:identity"],  # reversed
    }])
    assert not validator.is_valid(doc)


def test_task_involves_actor_endpoint_prefixes_enforced(
    validator: Draft202012Validator,
) -> None:
    doc = _minimal_doc(edges=[{
        "kind": "task-involves-actor",
        "endpoints": ["actor:applicant", "task:identify"],  # reversed
    }])
    assert not validator.is_valid(doc)


def test_action_emits_effect_endpoint_prefixes_enforced(
    validator: Draft202012Validator,
) -> None:
    doc = _minimal_doc(edges=[{
        "kind": "action-emits-effect",
        "endpoints": ["effect:submit:0", "action:submit"],  # reversed
    }])
    assert not validator.is_valid(doc)


def test_action_emits_effect_endpoint_index_must_be_numeric(
    validator: Draft202012Validator,
) -> None:
    doc = _minimal_doc(edges=[{
        "kind": "action-emits-effect",
        "endpoints": ["action:submit", "effect:submit:notAnIndex"],
    }])
    assert not validator.is_valid(doc)


def test_action_has_precondition_endpoint_prefixes_enforced(
    validator: Draft202012Validator,
) -> None:
    doc = _minimal_doc(edges=[{
        "kind": "action-has-precondition",
        "endpoints": ["precondition:submit:p1", "action:submit"],  # reversed
    }])
    assert not validator.is_valid(doc)


def test_concept_refs_item_endpoint_prefixes_enforced(
    validator: Draft202012Validator,
) -> None:
    doc = _minimal_doc(edges=[{
        "kind": "concept-refs-item",
        "endpoints": ["item:x", "concept:Schema/Person"],  # reversed
    }])
    assert not validator.is_valid(doc)


def test_concept_refs_component_node_endpoint_prefixes_enforced(
    validator: Draft202012Validator,
) -> None:
    doc = _minimal_doc(edges=[{
        "kind": "concept-refs-component-node",
        "endpoints": [
            "componentNodePath:/tree/children/0",
            "concept:Schema/Person",
        ],  # reversed
    }])
    assert not validator.is_valid(doc)


def test_node_visibility_references_item_endpoint_prefixes_enforced(
    validator: Draft202012Validator,
) -> None:
    doc = _minimal_doc(edges=[{
        "kind": "node-visibility-references-item",
        "endpoints": ["item:eligibility", "componentNodePath:/tree/children/0"],  # reversed
    }])
    assert not validator.is_valid(doc)


def test_unknown_endpoint_prefix_rejected(validator: Draft202012Validator) -> None:
    """§5.2: typed-string prefixes are a closed vocabulary."""
    doc = _minimal_doc(edges=[{
        "kind": "component-renders-item",
        "endpoints": [
            "componentNodePath:/tree/children/0",
            "field:applicantName",  # `field:` is not in the v1 prefix vocabulary
        ],
    }])
    assert not validator.is_valid(doc)


def test_endpoint_must_carry_payload_after_prefix(
    validator: Draft202012Validator,
) -> None:
    """§5.2: typed strings are `<prefix>:<payload>` — payload MUST be non-empty."""
    doc = _minimal_doc(edges=[{
        "kind": "component-renders-item",
        "endpoints": ["componentNodePath:", "item:x"],
    }])
    assert not validator.is_valid(doc)


# ---------------------------------------------------------------------------
# Identity-tuple completeness
# ---------------------------------------------------------------------------


def test_sidecar_identity_missing_required_field_rejected(
    validator: Draft202012Validator,
) -> None:
    for missing in ("sourceRef", "targetDefinitionUrl", "version"):
        ident = {
            "sourceRef": "experience.json",
            "targetDefinitionUrl": "https://x.test",
            "version": "1.0.0",
        }
        del ident[missing]
        doc = _minimal_doc(sources=[{
            "kind": "experience",
            "identity": ident,
            "digest": _VALID_DIGEST,
        }])
        assert not validator.is_valid(doc), (
            f"sidecar identity must require {missing}"
        )


def test_definition_identity_missing_required_field_rejected(
    validator: Draft202012Validator,
) -> None:
    for missing in ("url", "version"):
        ident = {"url": "https://x.test", "version": "1.0.0"}
        del ident[missing]
        doc = _minimal_doc(sources=[{
            "kind": "definition",
            "identity": ident,
            "digest": _VALID_DIGEST,
        }])
        assert not validator.is_valid(doc), (
            f"definition identity must require {missing}"
        )

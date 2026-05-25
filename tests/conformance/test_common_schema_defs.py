"""Conformance tests for ADR 0150 §10 common.schema.json $defs additions.

Covers the four new $defs (ModuleRef, AuthorActor, SessionRef, Generation) +
the helper CrossComponentRef. Generation MUST be a superset of the existing
inline x-generation shape at component.schema.json:240-282 — the superset proof
fixture ensures pre-existing x-generation payloads continue to validate.
"""

import json
from pathlib import Path

import pytest
from jsonschema import ValidationError, validate

SCHEMA = json.loads(
    (Path(__file__).parents[2] / "schemas" / "common.schema.json").read_text()
)
LEDGER_SCHEMA = json.loads(
    (Path(__file__).parents[2] / "schemas" / "respondent-ledger-event.schema.json").read_text()
)


def _validator_for(def_name: str) -> dict:
    return {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$defs": SCHEMA["$defs"],
        "$ref": f"#/$defs/{def_name}",
    }


def test_valueclass_closed_core_matches_respondent_ledger_changeset_entry():
    common_values = SCHEMA["$defs"]["ValueClass"]["oneOf"][0]["enum"]
    value_class_schema = LEDGER_SCHEMA["$defs"]["ChangeSetEntry"]["properties"]["valueClass"]
    assert value_class_schema["$ref"] == "https://formspec.org/schemas/common/1.0#/$defs/ValueClass"
    assert common_values == [
        "user-input",
        "prepopulated",
        "calculated",
        "imported",
        "attachment",
        "system-derived",
        "migration-derived",
    ]


def test_valueclass_accepts_closed_core_and_x_extension():
    validate("user-input", _validator_for("ValueClass"))
    validate("x-ai-generated", _validator_for("ValueClass"))


def test_valueclass_rejects_unregistered_bare_extension():
    with pytest.raises(ValidationError):
        validate("ai-generated", _validator_for("ValueClass"))


# ─── ModuleRef (ADR §4.4) ────────────────────────────────────────────────────


def test_moduleref_requires_id_and_version():
    with pytest.raises(ValidationError):
        validate({"version": "1.0.0"}, _validator_for("ModuleRef"))
    with pytest.raises(ValidationError):
        validate({"id": "x-formspec-core-task"}, _validator_for("ModuleRef"))


def test_moduleref_accepts_minimal():
    validate(
        {"id": "x-formspec-core-task", "version": "^1.0.0"},
        _validator_for("ModuleRef"),
    )


def test_moduleref_accepts_full():
    validate(
        {
            "id": "x-formspec-presentation",
            "version": "0.1.0",
            "publisher": "https://example.org/",
            "lockHash": "sha256:abcdef0123456789",
        },
        _validator_for("ModuleRef"),
    )


def test_moduleref_rejects_bad_id_prefix():
    with pytest.raises(ValidationError):
        validate(
            {"id": "core-task", "version": "1.0.0"},
            _validator_for("ModuleRef"),
        )


def test_moduleref_rejects_uppercase_id():
    with pytest.raises(ValidationError):
        validate(
            {"id": "x-Formspec-Core-Task", "version": "1.0.0"},
            _validator_for("ModuleRef"),
        )


def test_moduleref_rejects_bad_lockhash():
    with pytest.raises(ValidationError):
        validate(
            {"id": "x-foo", "version": "1.0.0", "lockHash": "not-a-digest"},
            _validator_for("ModuleRef"),
        )


# ─── AuthorActor (ADR §5.4) ──────────────────────────────────────────────────


def test_authoractor_requires_id_kind_actchannel():
    with pytest.raises(ValidationError):
        validate({}, _validator_for("AuthorActor"))


def test_authoractor_accepts_human_direct():
    validate(
        {
            "id": "urn:formspec:actor:human:alice",
            "kind": "human",
            "actChannel": "human",
        },
        _validator_for("AuthorActor"),
    )


def test_authoractor_accepts_ai_via_mcp():
    validate(
        {
            "id": "urn:formspec:actor:mcp:wireframes:agent-7",
            "kind": "ai-agent",
            "actChannel": "mcp",
            "display": "Wireframes MCP — agent 7",
        },
        _validator_for("AuthorActor"),
    )


def test_authoractor_rejects_unknown_kind():
    with pytest.raises(ValidationError):
        validate(
            {
                "id": "urn:formspec:actor:bot:0",
                "kind": "bot",  # not in closed enum
                "actChannel": "agent",
            },
            _validator_for("AuthorActor"),
        )


def test_authoractor_rejects_unknown_actchannel():
    with pytest.raises(ValidationError):
        validate(
            {
                "id": "urn:formspec:actor:human:alice",
                "kind": "human",
                "actChannel": "smoke-signal",  # not in closed enum
            },
            _validator_for("AuthorActor"),
        )


def test_authoractor_rejects_non_urn_id():
    with pytest.raises(ValidationError):
        validate(
            {
                "id": "alice@example.com",  # not a URN
                "kind": "human",
                "actChannel": "human",
            },
            _validator_for("AuthorActor"),
        )


# ─── SessionRef (ADR §5.5) ───────────────────────────────────────────────────


def test_sessionref_requires_id_openedat_actors():
    with pytest.raises(ValidationError):
        validate({}, _validator_for("SessionRef"))


def test_sessionref_accepts_minimal_open_session():
    validate(
        {
            "id": "urn:formspec:session:abc-123",
            "openedAt": "2026-05-23T18:00:00Z",
            "actors": ["urn:formspec:actor:human:alice"],
        },
        _validator_for("SessionRef"),
    )


def test_sessionref_accepts_closed_session():
    validate(
        {
            "id": "urn:formspec:session:xyz-789",
            "openedAt": "2026-05-23T18:00:00Z",
            "closedAt": "2026-05-23T19:30:00Z",
            "actors": [
                "urn:formspec:actor:human:alice",
                "urn:formspec:actor:ai-agent:assistant",
            ],
        },
        _validator_for("SessionRef"),
    )


def test_sessionref_rejects_non_urn_session_id():
    with pytest.raises(ValidationError):
        validate(
            {
                "id": "session-abc",  # not a URN
                "openedAt": "2026-05-23T18:00:00Z",
                "actors": ["urn:formspec:actor:human:alice"],
            },
            _validator_for("SessionRef"),
        )


def test_sessionref_rejects_non_urn_actor():
    with pytest.raises(ValidationError):
        validate(
            {
                "id": "urn:formspec:session:abc",
                "openedAt": "2026-05-23T18:00:00Z",
                "actors": ["alice"],  # not a URN
            },
            _validator_for("SessionRef"),
        )


def test_sessionref_requires_at_least_one_actor():
    with pytest.raises(ValidationError):
        validate(
            {
                "id": "urn:formspec:session:abc",
                "openedAt": "2026-05-23T18:00:00Z",
                "actors": [],
            },
            _validator_for("SessionRef"),
        )


# ─── Generation (ADR §5.3 / §5.4) — superset of existing x-generation ────────


def test_generation_accepts_existing_xgeneration_shape():
    """Superset proof: every field from the existing inline x-generation
    (component.schema.json:240-282) MUST validate against the new Generation
    $def. This is the regression-proof that protects every existing Component
    fixture using x-generation."""
    validate(
        {
            "source": "unit:identity",
            "strategy": "unit-to-section",
            "generatedBy": "component-generator/1.0.0",
            "generatedAt": "2026-05-23T18:00:00Z",
            "anchors": ["unit:identity", "item:applicantName"],
        },
        _validator_for("Generation"),
    )


def test_generation_accepts_authoractor_for_generatedby():
    validate(
        {
            "generatedBy": {
                "id": "urn:formspec:actor:ai-agent:agent-7",
                "kind": "ai-agent",
                "actChannel": "mcp",
            },
        },
        _validator_for("Generation"),
    )


def test_generation_accepts_string_generatedby():
    """Migration-friendly: pre-existing free-form generatedBy strings continue
    to validate."""
    validate(
        {"generatedBy": "x-formspec-studio-core@unit-kind-defaults"},
        _validator_for("Generation"),
    )


def test_generation_accepts_sourcemodule():
    validate(
        {
            "generatedBy": "urn:formspec:actor:ai-agent:wireframes",
            "sourceModule": {
                "id": "x-formspec-conversation",
                "version": "0.1.0",
            },
        },
        _validator_for("Generation"),
    )


def test_generation_accepts_movedfrom_and_copiedfrom():
    validate(
        {
            "movedFrom": {"route": "dashboard", "nodePath": "main.header.logo"},
            "copiedFrom": {"route": "settings", "nodePath": "form.field-1"},
        },
        _validator_for("Generation"),
    )


def test_generation_anchors_enforces_prefix_pattern():
    """Anchors retain the existing pattern enforcement
    (component.schema.json:272-279)."""
    with pytest.raises(ValidationError):
        validate(
            {"anchors": ["bogus:foo"]},  # not in closed prefix set
            _validator_for("Generation"),
        )


def test_generation_anchors_accepts_all_prefix_kinds():
    validate(
        {
            "anchors": [
                "item:applicantName",
                "unit:identity",
                "task:submit",
                "action:save",
                "concept:Person",
            ]
        },
        _validator_for("Generation"),
    )


def test_generation_accepts_graph_wide_component_identity_provenance():
    validate(
        {
            "movedFrom": {
                "component": {
                    "handle": "reviewRoute",
                    "url": "https://example.gov/apps/workspace/components/review-route",
                    "version": "1.0.0",
                },
                "surface": {
                    "url": "https://example.gov/apps/workspace/surfaces/respondent",
                    "version": "1.0.0",
                },
                "route": "review",
                "nodePath": "/reviewLayout/submit",
                "id": "submitButton",
                "nodeId": "submitNode",
            },
            "copiedFrom": {
                "component": {"handle": "reviewRoute"},
                "surface": {"url": "https://example.gov/apps/workspace/surfaces/respondent"},
                "route": "review",
                "nodePath": "/reviewLayout",
            },
        },
        _validator_for("Generation"),
    )


def test_generation_graph_wide_component_identity_requires_scope():
    with pytest.raises(ValidationError):
        validate(
            {
                "copiedFrom": {
                    "surface": {"url": "https://example.gov/apps/workspace/surfaces/respondent"},
                    "route": "review",
                    "nodePath": "/reviewLayout",
                }
            },
            _validator_for("Generation"),
        )

    with pytest.raises(ValidationError):
        validate(
            {
                "copiedFrom": {
                    "component": {"handle": "reviewRoute"},
                    "route": "review",
                    "nodePath": "/reviewLayout",
                }
            },
            _validator_for("Generation"),
        )

    with pytest.raises(ValidationError):
        validate(
            {
                "copiedFrom": {
                    "component": {"handle": "reviewRoute"},
                    "surface": {"url": "https://example.gov/apps/workspace/surfaces/respondent"},
                    "nodePath": "/reviewLayout",
                }
            },
            _validator_for("Generation"),
        )

    with pytest.raises(ValidationError):
        validate(
            {
                "copiedFrom": {
                    "component": {"handle": "reviewRoute"},
                    "surface": {"url": "https://example.gov/apps/workspace/surfaces/respondent"},
                    "route": "review",
                }
            },
            _validator_for("Generation"),
        )

    with pytest.raises(ValidationError):
        validate(
            {
                "copiedFrom": {
                    "component": {},
                    "surface": {"url": "https://example.gov/apps/workspace/surfaces/respondent"},
                    "route": "review",
                    "nodePath": "/reviewLayout",
                }
            },
            _validator_for("Generation"),
        )

    with pytest.raises(ValidationError):
        validate(
            {
                "copiedFrom": {
                    "component": {"handle": "reviewRoute"},
                    "surface": {},
                    "route": "review",
                    "nodePath": "/reviewLayout",
                }
            },
            _validator_for("Generation"),
        )


def test_generation_graph_wide_component_identity_requires_absolute_nodepath():
    with pytest.raises(ValidationError):
        validate(
            {
                "copiedFrom": {
                    "component": {"handle": "reviewRoute"},
                    "surface": {"url": "https://example.gov/apps/workspace/surfaces/respondent"},
                    "route": "review",
                    "nodePath": "reviewLayout",
                }
            },
            _validator_for("Generation"),
        )


def test_generation_accepts_legacy_same_runtime_component_provenance():
    validate(
        {"copiedFrom": {"route": "dashboard", "nodePath": "header.logo"}},
        _validator_for("Generation"),
    )


# ─── CrossComponentRef (helper used by Generation.movedFrom/copiedFrom) ──────


def test_crosscomponentref_requires_route_and_nodepath():
    with pytest.raises(ValidationError):
        validate({"route": "x"}, _validator_for("CrossComponentRef"))
    with pytest.raises(ValidationError):
        validate({"nodePath": "x"}, _validator_for("CrossComponentRef"))


def test_crosscomponentref_accepts_full():
    validate(
        {"route": "dashboard", "nodePath": "header.logo"},
        _validator_for("CrossComponentRef"),
    )

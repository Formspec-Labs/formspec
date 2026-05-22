"""Schema acceptance tests for the Validation Mapping companion spec.

Loads schemas/validation-mapping.schema.json and pins its expected `$defs`.
Fixture shape validation lives in tests/conformance/spec/test_validation_mapping_table.py.
"""
import json
from pathlib import Path

import jsonschema
import pytest
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

SCHEMA_PATH = Path(__file__).resolve().parents[3] / "schemas" / "validation-mapping.schema.json"
FIXTURES_DIR = Path(__file__).resolve().parents[2] / "conformance" / "fixtures" / "validation-mapping"


@pytest.fixture(scope="module")
def schema():
    with SCHEMA_PATH.open() as f:
        return json.load(f)


@pytest.fixture(scope="module")
def validator(schema):
    return jsonschema.Draft202012Validator(schema)


def _load(name: str) -> dict:
    with (FIXTURES_DIR / name).open() as f:
        return json.load(f)


class TestValidationMappingSchemaShape:
    def test_schema_has_expected_defs(self, schema):
        defs = schema.get("$defs", {})
        for name in (
            "ActionIntent",
            "ValidationProfile",
            "BlockingPolicy",
            "PersistencePolicy",
            "ValidationTuplePredicate",
            "ValidationTuple",
            "MappingEntry",
            "MasterTable",
        ):
            assert name in defs, f"Missing $def: {name}"

    def test_validation_tuple_predicate_is_open_for_composition(self, schema):
        predicate = schema["$defs"]["ValidationTuplePredicate"]

        assert set(predicate["properties"]) == {"profile", "blocking", "persistence"}
        assert "additionalProperties" not in predicate, (
            "The predicate helper must remain composable with schemas that add fields, "
            "such as MappingEntry.intent."
        )

    def test_validation_tuple_is_closed_for_exact_consumers(self, schema):
        tuple_def = schema["$defs"]["ValidationTuple"]

        assert tuple_def["required"] == ["profile", "blocking", "persistence"]
        assert set(tuple_def["properties"]) == {"profile", "blocking", "persistence"}
        assert tuple_def["additionalProperties"] is False
        assert tuple_def["allOf"] == [{"$ref": "#/$defs/ValidationTuplePredicate"}]

    def test_action_intent_enum_is_closed(self, schema):
        ai = schema["$defs"]["ActionIntent"]
        assert ai.get("enum") == [
            "save-draft",
            "autosave",
            "review",
            "submit",
            "request-evidence",
        ]

    def test_profile_enum_is_closed(self, schema):
        vp = schema["$defs"]["ValidationProfile"]
        assert vp.get("enum") == ["live", "on-submit", "on-demand", "off"]

    def test_blocking_enum_is_closed(self, schema):
        bp = schema["$defs"]["BlockingPolicy"]
        assert bp.get("enum") == ["non-blocking", "block-on-error"]

    def test_persistence_enum_is_closed(self, schema):
        pp = schema["$defs"]["PersistencePolicy"]
        assert pp.get("enum") == ["none", "draft-checkpoint", "complete-response"]

    def test_mapping_entry_allows_x_intent_extension(self, schema):
        entry_schema = {
            "$schema": schema["$schema"],
            "$defs": schema["$defs"],
            "$ref": "#/$defs/MappingEntry",
        }
        jsonschema.Draft202012Validator(entry_schema).validate({
            "intent": "x-acme-bulk-import",
            "profile": "on-submit",
            "blocking": "block-on-error",
            "persistence": "complete-response",
        })

    def test_mapping_entry_composes_with_validation_tuple_predicate(self, schema):
        assert schema["$defs"]["MappingEntry"]["allOf"] == [
            {"$ref": "#/$defs/ValidationTuplePredicate"}
        ]

    def test_mapping_entry_rejects_unprefixed_unknown_intent(self, schema):
        entry_schema = {
            "$schema": schema["$schema"],
            "$defs": schema["$defs"],
            "$ref": "#/$defs/MappingEntry",
        }
        validator = jsonschema.Draft202012Validator(entry_schema)
        errors = list(validator.iter_errors({
            "intent": "quickSave",
            "profile": "off",
            "blocking": "non-blocking",
            "persistence": "draft-checkpoint",
        }))
        assert errors, "Unprefixed non-enum intents MUST be rejected"

    @pytest.mark.parametrize("bad_entry", [
        {
            "intent": "submit",
            "profile": "live",
            "blocking": "block-on-error",
            "persistence": "complete-response",
        },
        {
            "intent": "submit",
            "profile": "on-demand",
            "blocking": "block-on-error",
            "persistence": "complete-response",
        },
        {
            "intent": "submit",
            "profile": "on-submit",
            "blocking": "non-blocking",
            "persistence": "complete-response",
        },
        {
            "intent": "save-draft",
            "profile": "off",
            "blocking": "block-on-error",
            "persistence": "draft-checkpoint",
        },
        {
            "intent": "review",
            "profile": "on-submit",
            "blocking": "block-on-error",
            "persistence": "none",
        },
        {
            "intent": "request-evidence",
            "profile": "on-demand",
            "blocking": "block-on-error",
            "persistence": "draft-checkpoint",
        },
    ])
    def test_mapping_entry_schema_rejects_prohibited_tuples(self, schema, bad_entry):
        entry_schema = {
            "$schema": schema["$schema"],
            "$defs": schema["$defs"],
            "$ref": "#/$defs/MappingEntry",
        }
        validator = jsonschema.Draft202012Validator(entry_schema)
        assert list(validator.iter_errors(bad_entry)), bad_entry

    @pytest.mark.parametrize("bad_tuple", [
        {
            "profile": "on-submit",
            "blocking": "non-blocking",
            "persistence": "complete-response",
        },
        {
            "profile": "on-demand",
            "blocking": "block-on-error",
            "persistence": "complete-response",
        },
        {
            "profile": "on-submit",
            "blocking": "block-on-error",
            "persistence": "none",
        },
        {
            "profile": "on-submit",
            "blocking": "block-on-error",
            "persistence": "draft-checkpoint",
        },
        {
            "profile": "off",
            "blocking": "block-on-error",
            "persistence": "draft-checkpoint",
        },
    ])
    def test_validation_tuple_rejects_prohibited_combinations(self, schema, bad_tuple):
        tuple_schema = {
            "$schema": schema["$schema"],
            "$defs": schema["$defs"],
            "$ref": "#/$defs/ValidationTuple",
        }
        validator = jsonschema.Draft202012Validator(tuple_schema)

        assert list(validator.iter_errors(bad_tuple)), bad_tuple

    def test_validation_tuple_accepts_response_actions_override_shape(self, schema):
        tuple_schema = {
            "$schema": schema["$schema"],
            "$defs": schema["$defs"],
            "$ref": "#/$defs/ValidationTuple",
        }

        jsonschema.Draft202012Validator(tuple_schema).validate({
            "profile": "on-submit",
            "blocking": "block-on-error",
            "persistence": "complete-response",
        })

    def test_validation_tuple_rejects_extra_properties_for_exact_consumers(self, schema):
        tuple_schema = {
            "$schema": schema["$schema"],
            "$defs": schema["$defs"],
            "$ref": "#/$defs/ValidationTuple",
        }
        validator = jsonschema.Draft202012Validator(tuple_schema)

        errors = list(validator.iter_errors({
            "profile": "on-submit",
            "blocking": "block-on-error",
            "persistence": "complete-response",
            "x-extra": True,
        }))

        assert errors, "ValidationTuple must be exact for Response Actions ValidationOverride"

    def test_validation_tuple_resolves_by_canonical_schema_id_for_consumers(self, schema):
        consumer_schema = {
            "$schema": schema["$schema"],
            "$ref": "https://formspec.org/schemas/validationMapping/1.0#/$defs/ValidationTuple",
        }
        registry = Registry().with_resource(
            schema["$id"],
            Resource.from_contents(schema, default_specification=DRAFT202012),
        )
        validator = jsonschema.Draft202012Validator(consumer_schema, registry=registry)

        validator.validate({
            "profile": "on-submit",
            "blocking": "block-on-error",
            "persistence": "complete-response",
        })

        errors = list(validator.iter_errors({
            "profile": "on-submit",
            "blocking": "block-on-error",
            "persistence": "draft-checkpoint",
        }))
        assert errors, "Canonical $id ref must enforce the reusable tuple predicate"

"""Schema acceptance tests for the Data Sources peer artifact."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from jsonschema import Draft202012Validator, ValidationError

from tests.unit.support.schema_fixtures import build_schema_registry, load_schema


ROOT = Path(__file__).resolve().parents[3]
FIXTURES_DIR = ROOT / "tests" / "conformance" / "fixtures" / "data-sources"
DATA_SOURCES_SCHEMA = load_schema("data-sources.schema.json")
COMMON_SCHEMA = load_schema("common.schema.json")


def _validator() -> Draft202012Validator:
    return Draft202012Validator(
        DATA_SOURCES_SCHEMA,
        registry=build_schema_registry(COMMON_SCHEMA, DATA_SOURCES_SCHEMA),
        format_checker=Draft202012Validator.FORMAT_CHECKER,
    )


def _fixture_doc(name: str) -> dict:
    with (FIXTURES_DIR / name).open(encoding="utf-8") as handle:
        return json.load(handle)


class TestDataSourcesSchemaShape:
    def test_schema_is_well_formed(self) -> None:
        Draft202012Validator.check_schema(DATA_SOURCES_SCHEMA)

    def test_top_level_discriminator_and_required_fields(self) -> None:
        assert DATA_SOURCES_SCHEMA["properties"]["$formspecDataSources"]["const"] == "1.0"
        assert set(DATA_SOURCES_SCHEMA["required"]) == {
            "$formspecDataSources",
            "version",
            "id",
            "sources",
        }

    def test_kind_taxonomy_is_closed(self) -> None:
        kinds = DATA_SOURCES_SCHEMA["$defs"]["DataSourceKind"]["enum"]
        assert kinds == [
            "host-state",
            "definition-response",
            "document-resource",
            "conversation-stream",
            "query-result",
            "route-params",
        ]

    def test_runtime_authorization_boundary_is_coarse_only(self) -> None:
        boundary = DATA_SOURCES_SCHEMA["$defs"]["RuntimeBehavior"]["properties"]["authorizationBoundary"]
        assert boundary["enum"] == ["host", "formspec-session", "module"]
        assert "Fine-grained" in boundary["description"]

    def test_valid_catalog_fixture_passes(self) -> None:
        _validator().validate(_fixture_doc("valid-catalog.json"))


@pytest.mark.parametrize(
    "fixture_name",
    [
        "id-prefix-mismatch.json",
        "cache-none-stale-after.json",
        "live-with-snapshot-cache.json",
        "draft-not-definition-response.json",
        "provenance-kind-mismatch.json",
        "surface-without-surface-ref.json",
        "slot-without-surface-ref.json",
        "fine-grained-auth.json",
    ],
)
def test_negative_fixtures_fail_schema(fixture_name: str) -> None:
    with pytest.raises(ValidationError):
        _validator().validate(_fixture_doc(fixture_name))


def test_duplicate_id_fixture_is_schema_valid_but_semantically_invalid() -> None:
    _validator().validate(_fixture_doc("duplicate-id.json"))
